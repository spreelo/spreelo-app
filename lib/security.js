import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

function ipv4ToNumber(address) {
  return address
    .split(".")
    .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function isIpv4InRange(address, rangeAddress, prefixLength) {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(rangeAddress) & mask);
}

function isPrivateIpv4(address) {
  return PRIVATE_IPV4_RANGES.some(([rangeAddress, prefixLength]) =>
    isIpv4InRange(address, rangeAddress, prefixLength)
  );
}

function isPrivateIpv6(address) {
  const normalized = String(address || "").toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./u.test(normalized)
  );
}

function isBlockedHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase().replace(/\.$/u, "");

  return (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal"
  );
}

function isBlockedIp(address) {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) return isPrivateIpv4(address);
  if (ipVersion === 6) return isPrivateIpv6(address);

  return false;
}

export async function assertPublicHttpUrl(rawUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Invalid website URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https website URLs are allowed.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Website URLs with embedded credentials are not allowed.");
  }

  const hostname = parsedUrl.hostname;

  if (isBlockedHostname(hostname)) {
    throw new Error("This website URL is not allowed.");
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("Private or internal IP addresses are not allowed.");
    }

    return parsedUrl.toString();
  }

  let resolvedAddresses = [];

  try {
    resolvedAddresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve website hostname.");
  }

  if (!resolvedAddresses.length) {
    throw new Error("Could not resolve website hostname.");
  }

  const blockedAddress = resolvedAddresses.find((entry) => isBlockedIp(entry.address));

  if (blockedAddress) {
    throw new Error("Private or internal network addresses are not allowed.");
  }

  return parsedUrl.toString();
}
