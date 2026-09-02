const socketSetup = (io) => {
    io.on('connection', (socket) => {
      console.log(`[SOCKET] User connected: ${socket.id}`);
  
      // Client identifies itself so we can target notifications at a specific
      // user (same room mechanism as group rooms, keyed by user id).
      socket.on('identify', (userId) => {
        if (userId === undefined || userId === null || userId === '') return;
        socket.join(`user:${userId}`);
        console.log(`[SOCKET] Socket ${socket.id} identified as user:${userId}`);
      });

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