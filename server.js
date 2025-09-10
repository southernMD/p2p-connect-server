/*
 * @Description: create by southernMD
 */
const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);

app.use(cors());

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
/**
 * 判断给定的 IP 地址是否属于内网或回环地址。
 *
 * 内网范围包括：
 * - IPv4 A类私有地址：10.0.0.0 – 10.255.255.255
 * - IPv4 B类私有地址：172.16.0.0 – 172.31.255.255
 * - IPv4 C类私有地址：192.168.0.0 – 192.168.255.255
 * - IPv4 回环地址：127.0.0.0 – 127.255.255.255
 * - IPv6 回环地址：::1
 * - IPv6 私有地址（fc00::/7）
 * - IPv6 链路本地地址（fe80::/10）
 *
 * @param {string} ip - 要判断的 IP 地址（IPv4 或 IPv6）。
 * @returns {boolean} 如果是内网或回环地址，返回 true；否则返回 false。
 */
function internalNet(ip) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;         // IPv4 回环
  if (ip === '::1') return true;                  // IPv6 回环
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 私有地址
  if (ip.startsWith('fe80:')) return true;        // IPv6 链路本地地址（可选）
  return false;
}

function getKey(ip) {
  const isInternalNet = internalNet(ip);
  return isInternalNet ? ip : 'external'
}

io.on('connection', (socket) => {
  const baseIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.headers['x-real-ip'] || socket.handshake.address;
  const baseIplist = baseIp.split(',').map(ip => ip.trim());
  let roomId
  for (let i = 0; i < baseIplist.length; i++) {
    const ip = baseIplist[i];
    const cleanIp = ip.split('::ffff:').join('');
    const roomKey = getKey(cleanIp);
    const ipParts = cleanIp.split('.');
    const subnet = `${ipParts[0]}.${ipParts[1]}`;
    console.log(`用户ip: ${cleanIp}, 房间: ${roomKey}, 区域: ${subnet}`);
    roomId = roomKey !== 'external' ? subnet : 'external'
    if (roomId !== 'external') break;
  }
  socket.join(roomId);
  console.log(`Socket ${socket.id} joined room ${roomId}`);
  socket.emit("me", { id: socket.id, userList: Array.from(io.sockets.adapter.rooms.get(roomId) || []) });

  socket.on("one-user-join-room", ({ signal, newSocketId, oldSocketId }) => {
    socket.broadcast.to(roomId).emit("one-user-joined", { signal, newSocketId, oldSocketId });
    console.log('a user connected');
  });

  socket.on("give-new-user-signal", ({ newSocketId, signal, oldSocketId }) => {
    console.log(newSocketId);
    io.to(newSocketId).emit("get-old-user-signal", { signal, oldSocketId });
  });

  socket.on('disconnect', () => {
    console.log("disconnect");
    socket.leave(roomId);
    socket.broadcast.to(roomId).emit('user-leave', { id: socket.id });
  });
});

server.listen(5001, () => {
  console.log('listening on port 5001')
})