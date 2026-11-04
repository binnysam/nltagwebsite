// D16 finding 3 investigation (test tooling, not committed evidence of D16): a TCP proxy in front of
// a LOCAL MariaDB that delays every server->client chunk by D ms, i.e. adds D ms to each database
// round trip, so a one-query difference in a request's own pre-reservation time shows without CPU
// saturation. Loopback only. Usage: node latency-proxy.mjs <listenPort> <targetPort> <delayMs>
import net from "node:net";

const [listenPort, targetPort, delayMs] = process.argv.slice(2).map(Number);
const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  client.pipe(upstream);
  upstream.on("data", (chunk) => {
    // Equal delays keep chunk order (timers with the same timeout fire in insertion order).
    setTimeout(() => client.writable && client.write(chunk), delayMs);
  });
  upstream.on("end", () => setTimeout(() => client.end(), delayMs));
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  client.on("close", () => upstream.destroy());
});
server.listen(listenPort, "127.0.0.1", () => console.log(`latency proxy :${listenPort} -> :${targetPort} (+${delayMs} ms per response)`));
