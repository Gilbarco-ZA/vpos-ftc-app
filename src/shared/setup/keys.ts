// Shared setup KV contract. Keep key names stable for routes, modules, and UI.
export const KV_KEYS = {
  SITE_PROFILE: 'site.profile',
  TANKS_CONFIG: 'tanks.config',
  PUMPS_CONFIG: 'pumps.config',
  SETUP_COMPLETE: 'setup.complete',
  SETUP_STEP: 'setup.step',
  SETUP_UPDATED_AT: 'setup.updatedAt',

  VPOS_DEVICE_DATA: 'vpos.device.data',
  VPOS_DEVICE_REGISTRATION: 'vpos.device.registration',
  PROXY_IDENTITY: 'proxy.identity',

  VPOS_CERT_DATA: 'vpos.cert.data',
  VPOS_CERT_PASSPHRASE: 'vpos.cert.passphrase',
} as const
