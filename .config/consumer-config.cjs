// Shared build-time consumer configuration. Canonical source: mono-package-mgr/tools/consumer-config.cjs.
// Consumer copies must match this file; no runtime or registry dependency is needed.
"use strict";

const { join } = require("node:path");

const PACKAGE_TARGET_DEFAULTS = {
  "cpb-539-node18": {
    id: "cpb539_node18",
    cpbVersion: "539",
    nodeVersion: "18.12.1",
    nodeVersionDir: "node-v18.12.1-linux-armv7l",
    runtimeArchitecture: "armv7l",
    opkgArchitecture: "armv7l",
  },
  "cpb-539-node22": {
    id: "cpb539_node22",
    cpbVersion: "539",
    nodeVersion: "22.15.0",
    nodeVersionDir: "node-v22.15.0-linux-armv7l",
    runtimeArchitecture: "armv7l",
    opkgArchitecture: "armv7l",
  },
  "cpb-579-node22": {
    id: "cpb579_node22",
    cpbVersion: "579",
    nodeVersion: "22.15.0",
    nodeVersionDir: "node-v22.15.0-linux-arm64",
    runtimeArchitecture: "arm64",
    opkgArchitecture: "aarch64",
  },
};

function getNodeDependency(major) {
  if (major === "18") return "90005101";
  if (major === "22") return "90005102";
  throw new Error("Unsupported Node dependency major: " + major);
}

function commonConsumerConfig(root = process.cwd()) {
  return {
    section: "base",
    priority: "optional",
    changelogFile: join(root, ".config", "changelog.log"),
    archiveFile: join(root, ".config", "changelog.archive.log"),
  };
}

function resolveConsumerRuntime(options = {}) {
  const env = options.env || process.env;
  const packageTargetName = env.FNEZ_PACKAGE_TARGET_NAME || "cpb-539-node22";
  const name = packageTargetName.toLowerCase();
  if (name === "cpb-579-node18") {
    throw new Error("CPB579 supports Node.js 22 only (CPB579 only with Node 22).");
  }
  if (!Object.prototype.hasOwnProperty.call(PACKAGE_TARGET_DEFAULTS, name)) {
    throw new Error("Unsupported package target '" + packageTargetName + "'.");
  }
  const profile = PACKAGE_TARGET_DEFAULTS[name];
  const major = profile.nodeVersion.split(".")[0];
  const packageNodeVersion = env.FNEZ_NODE_VERSION || profile.nodeVersion;
  if (!packageNodeVersion.startsWith(major + ".")) {
    throw new Error("Node.js version '" + packageNodeVersion + "' does not match package target '" + packageTargetName + "'.");
  }
  const cpbVersion = env.FNEZ_CPB_VERSION || profile.cpbVersion;
  if (String(cpbVersion).toLowerCase().replace("cpb-", "") !== profile.cpbVersion) {
    throw new Error("Package target '" + packageTargetName + "' does not match CPB version '" + cpbVersion + "'.");
  }
  const runtimeArchitecture = env.FNEZ_RUNTIME_ARCH || profile.runtimeArchitecture;
  if (runtimeArchitecture.toLowerCase() !== profile.runtimeArchitecture) {
    throw new Error("Unsupported runtime architecture '" + runtimeArchitecture + "' for " + packageTargetName + ". Expected " + profile.runtimeArchitecture + ".");
  }
  const nodeVersionDir = env.FNEZ_NODE_VERSION_DIR || profile.nodeVersionDir;
  const match = /^node-v(\d+)\.\d+\.\d+-linux-(armv7l|arm64)$/i.exec(nodeVersionDir);
  if (!match || match[1] !== major || match[2].toLowerCase() !== profile.runtimeArchitecture ||
      (options.strictDirectory && nodeVersionDir !== profile.nodeVersionDir)) {
    throw new Error("Node runtime directory '" + nodeVersionDir + "' does not match '" + packageTargetName + "'. Expected a compatible " + profile.nodeVersionDir + " runtime.");
  }
  if (env.FNEZ_OPKG_ARCHITECTURE && env.FNEZ_OPKG_ARCHITECTURE !== profile.opkgArchitecture) {
    throw new Error("OPKG architecture does not match package target '" + packageTargetName + "'. Expected " + profile.opkgArchitecture + ".");
  }
  return {
    packageTargetName,
    packageNodeVersion,
    cpbVersion,
    runtimeArchitecture,
    nodeVersionDir,
    nodeDependency: getNodeDependency(major),
  };
}

// Expand a small, declarative application config to the existing builder contract.
// The optional runtime profiles retain the two existing Node22-only consumers'
// direct config loading behavior; target selection in CI remains unchanged.
function defineConsumerConfig(fields, options = {}) {
  const env = options.env || process.env;
  const runtime = options.runtime || "validated";
  let nodeDependency = getNodeDependency("22");
  let runtimeFields = {};
  if (runtime === "validated") {
    const { nodeDependency: selectedDependency, ...target } = resolveConsumerRuntime({
      env, strictDirectory: options.strictDirectory,
    });
    nodeDependency = selectedDependency;
    runtimeFields = target;
    if (options.scopedPermOwnership) {
      runtimeFields.strictPermOwnership =
        String(target.cpbVersion).toLowerCase().replace("cpb-", "") !== "579";
    }
  } else if (runtime === "node22-directory") {
    runtimeFields.nodeVersionDir = env.FNEZ_NODE_VERSION_DIR ||
      PACKAGE_TARGET_DEFAULTS["cpb-539-node22"].nodeVersionDir;
  } else if (runtime !== "node22-static") {
    throw new Error("Unsupported consumer runtime profile: " + runtime);
  }

  const config = {
    ...commonConsumerConfig(),
    description: "\n  " + fields.descriptionSml + "\n",
    limitations: "\n  None\n",
    installGuide: "\n  Install the package via the FccWebApp \"5.2 Software Update\" page.\n  Please consult the installation, configuration and user manuals.\n",
    installationSteps: [{
      title: "Upgrade process: ",
      steps: [
        "Install the package provided in this email using the FccWebApp '5.2 Software Update' page.",
        "Make sure your DOMS PSS 5000 is connected to the internet.",
        "Make sure your EPSON printer is connected to the same network DOMS PSS 5000.",
      ],
    }],
    emailListCC: [""],
    environmentVariables: {},
    ...fields,
    ...runtimeFields,
    dependencies: fields.dependencies.split(",").map(id => id === "node" ? nodeDependency : id).join(","),
  };
  // Keep the existing explicitly bounded legacy package identities. Never
  // infer or extend a removal allowlist from the current release version.
  if (options.legacyOpkg) {
    const { version, through } = options.legacyOpkg;
    if (!/^\d+\.\d{2}$/.test(version) || !Number.isInteger(through) || through < 0 || through > 999) {
      throw new Error("Invalid legacy OPKG package range");
    }
    const prefix = config.domsAppId + "-" + version;
    config.legacyOpkgPackages = [
      prefix,
      ...Array.from({ length: through }, (_, index) =>
        prefix + "t" + String(index + 1).padStart(3, "0")),
    ];
  }
  return config;
}

module.exports = { PACKAGE_TARGET_DEFAULTS, getNodeDependency, commonConsumerConfig, resolveConsumerRuntime, defineConsumerConfig };
