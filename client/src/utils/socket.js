import { io } from 'socket.io-client';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const socket = io(BASE_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;