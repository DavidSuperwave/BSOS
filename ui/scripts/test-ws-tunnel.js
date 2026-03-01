/**
 * Test WebSocket connection through SSH tunnel to container's internal IP.
 */
require("dotenv").config({ path: ".env.local" });
const WebSocket = require("ws");
const { Client } = require("ssh2");
const net = require("net");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) {
  console.error("No PROVISIONER_SSH_KEY");
  process.exit(1);
}
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const token = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

console.log("1. Connecting SSH...");
const sshConn = new Client();

sshConn.on("ready", () => {
  console.log("2. SSH connected. Getting container IP...");

  sshConn.exec(
    'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" openclaw-supersauce',
    (err, stream) => {
      if (err) {
        console.error(err);
        sshConn.end();
        return;
      }
      let ip = "";
      stream.on("data", (d) => (ip += d.toString().trim()));
      stream.on("close", () => {
        console.log("3. Container IP:", ip);
        if (!ip) {
          console.error("No container IP found");
          sshConn.end();
          return;
        }

        // Create local TCP bridge to container IP
        const server = net.createServer((localSocket) => {
          sshConn.forwardOut(
            "127.0.0.1",
            0,
            ip,
            18789,
            (err2, remoteStream) => {
              if (err2) {
                console.error("Tunnel error:", err2.message);
                localSocket.destroy();
                return;
              }
              localSocket.pipe(remoteStream).pipe(localSocket);
            }
          );
        });

        server.listen(0, "127.0.0.1", () => {
          const localPort = server.address().port;
          console.log(
            "4. Local bridge on port",
            localPort,
            "-> SSH ->",
            ip + ":18789"
          );

          const ws = new WebSocket("ws://127.0.0.1:" + localPort);

          ws.on("open", () => console.log("5. WS OPEN!"));
          ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            console.log(
              "6. MSG:",
              msg.type,
              msg.event || msg.id || "",
              JSON.stringify(msg).slice(0, 200)
            );

            if (
              msg.type === "event" &&
              msg.event === "connect.challenge"
            ) {
              console.log("7. Sending connect...");
              ws.send(
                JSON.stringify({
                  type: "req",
                  id: "connect-1",
                  method: "connect",
                  params: {
                    token,
                    device: { type: "api", name: "blitzscale-ui" },
                  },
                })
              );
            }
            if (msg.type === "res" && msg.id === "connect-1") {
              console.log("8. Connect ok:", msg.ok);
              if (msg.ok) {
                console.log("SUCCESS! Sending health check...");
                ws.send(
                  JSON.stringify({
                    type: "req",
                    id: "h-1",
                    method: "health",
                    params: {},
                  })
                );
              } else {
                console.log("FAILED:", JSON.stringify(msg.error));
                ws.close();
                server.close();
                sshConn.end();
              }
            }
            if (msg.type === "res" && msg.id === "h-1") {
              console.log(
                "9. Health response:",
                JSON.stringify(msg).slice(0, 300)
              );
              ws.close();
              server.close();
              sshConn.end();
            }
          });
          ws.on("error", (e) => {
            console.error("WS error:", e.message);
            server.close();
            sshConn.end();
          });
          ws.on("close", () => console.log("WS closed"));
          setTimeout(() => {
            console.log("TIMEOUT");
            ws.close();
            server.close();
            sshConn.end();
          }, 20000);
        });
      });
    }
  );
});

sshConn.on("error", (err) => console.error("SSH error:", err.message));
sshConn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: cleanKey,
  readyTimeout: 15000,
});
