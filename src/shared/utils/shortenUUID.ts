export const shortenUUID = (id: string) =>
  String(id ?? '')
    .replace(/-/g, '')
    .slice(0, 12)
    .toUpperCase()
