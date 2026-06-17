const socketSetup = (io) => {
    io.on('connection', (socket) => {
      console.log(`[SOCKET] User connected: ${socket.id}`);
  
      // Client joins a group room when they open GroupDetail
      socket.on('join_group', (groupId) => {
        socket.join(`group:${groupId}`);
        console.log(`[SOCKET] Socket ${socket.id} joined group:${groupId}`);
      });
  
      // Client leaves group room when they navigate away
      socket.on('leave_group', (groupId) => {
        socket.leave(`group:${groupId}`);
        console.log(`[SOCKET] Socket ${socket.id} left group:${groupId}`);
      });
  
      socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);
      });
    });
  };
  
  module.exports = socketSetup;