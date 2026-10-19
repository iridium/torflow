export const SOURCES = {
  relays: 'Tor Project CollecTor — network-status consensuses',
  stats: 'Tor Project Metrics — bandwidth, relay users, onion-service traffic',
  geo: process.env.GEOIP_DB ? 'custom MMDB city database' : 'IP Geolocation by DB-IP (CC BY 4.0)',
};
