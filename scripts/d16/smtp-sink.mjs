// D16 harness: a local SMTP sink on 127.0.0.1 (never a real mail server). It answers the SMTP
// greeting and EHLO without STARTTLS, so the site's transport (requireTLS) refuses to send and no
// message content ever exists. It only counts connections, so a run can show that sign-in probes
// produced no mail traffic. Usage: node smtp-sink.mjs <port> <count-file>
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";

const port = Number(process.argv[2] ?? 2525);
const countFile = process.argv[3];
let connections = 0;
const server = createServer((socket) => {
  connections += 1;
  socket.write("220 d16-sink.local ESMTP harness sink\r\n");
  socket.on("data", (buf) => {
    const line = buf.toString("latin1").trim().toUpperCase();
    if (line.startsWith("EHLO") || line.startsWith("HELO")) socket.write("250 d16-sink.local\r\n");
    else if (line.startsWith("QUIT")) socket.end("221 bye\r\n");
    else socket.write("502 not implemented\r\n");
  });
  socket.on("error", () => undefined);
});
server.listen(port, "127.0.0.1");
const stop = () => {
  if (countFile) writeFileSync(countFile, JSON.stringify({ connections }));
  server.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
