import { io } from 'socket.io-client';

const normalizeApiBase = () => {
  const raw = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
};

const BASE_URL = normalizeApiBase();

const socket = io(BASE_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;