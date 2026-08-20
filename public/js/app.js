const socket = io();

let username = localStorage.getItem('angelcord_username') || '';
let servers = [];
let currentServerId = null;
let currentChannelId = null;
let currentChannelType = null;

// ===== WebRTC state =====
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let micOn = true;
let camOn = false;
const peers = {}; // socketId -> RTCPeerConnection
const peerUsernames = {}; // socketId -> username

// ===== ELEMENTS =====
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const usernameConfirm = document.getElementById('usernameConfirm');

const createServerModal = document.getElementById('createServerModal');
const joinServerModal = document.getElementById('joinServerModal');
const createChannelModal = document.getElementById('createChannelModal');
const inviteModal = document.getElementById('inviteModal');

const serverIconList = document.getElementById('serverIconList');
const channelList = document.getElementById('channelList');
const currentServerNameEl = document.getElementById('currentServerName');
const currentChannelNameEl = document.getElementById('currentChannelName');
const userNameDisplay = document.getElementById('userNameDisplay');
const userAvatarInitial = document.getElementById('userAvatarInitial');

const textView = document.getElementById('textView');
const voiceView = document.getElementById('voiceView');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const videoGrid = document.getElementById('videoGrid');

// ===== USERNAME SETUP =====
function initUsername() {
  if (username) {
    usernameModal.classList.add('hidden');
    afterIdentify();
  } else {
    usernameModal.classList.remove('hidden');
  }
}
usernameConfirm.addEventListener('click', () => {
  const val = usernameInput.value.trim();
  if (!val) return;
  username = val.slice(0, 24);
  localStorage.setItem('angelcord_username', username);
  usernameModal.classList.add('hidden');
  afterIdentify();
});
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') usernameConfirm.click(); });

function afterIdentify() {
  userNameDisplay.textContent = username;
  userAvatarInitial.textContent = username.charAt(0).toUpperCase();
  socket.emit('identify', username);
}

socket.on('connect', () => { if (username) afterIdentify(); });
initUsername();

// ===== SERVER LIST =====
socket.on('servers-list', (list) => {
  servers = list;
  renderServerRail();
  if (currentServerId) renderChannelList();
});

function renderServerRail() {
  serverIconList.innerHTML = '';
  servers.forEach(s => {
    const div = document.createElement('div');
    div.className = 'server-icon' + (s.id === currentServerId ? ' active' : '');
    div.title = s.name + (s.isPrivate ? ' (privado)' : '');
    div.textContent = initials(s.name);
    div.addEventListener('click', () => selectServer(s.id));
    serverIconList.appendChild(div);
  });
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function selectServer(serverId) {
  currentServerId = serverId;
  currentChannelId = null;
  renderServerRail();
  renderChannelList();
}

function renderChannelList() {
  const s = servers.find(x => x.id === currentServerId);
  if (!s) { currentServerNameEl.textContent = 'Selecione um servidor'; channelList.innerHTML = ''; return; }
  currentServerNameEl.textContent = s.name;
  channelList.innerHTML = '';
  s.channels.forEach(ch => {
    const div = document.createElement('div');
    div.className = 'channel-item' + (ch.id === currentChannelId ? ' active' : '');
    div.innerHTML = `<span class="hash">${ch.type === 'voice' ? '🔊' : '#'}</span> ${escapeHtml(ch.name)}`;
    div.addEventListener('click', () => selectChannel(ch));
    channelList.appendChild(div);
  });
  const createLink = document.createElement('div');
  createLink.className = 'create-channel-link';
  createLink.innerHTML = '<span>+ Criar canal</span>';
  createLink.addEventListener('click', () => createChannelModal.classList.remove('hidden'));
  channelList.appendChild(createLink);
}

function selectChannel(ch) {
  if (currentChannelType === 'voice' && currentChannelId && currentChannelId !== ch.id) {
    leaveVoice();
  }
  currentChannelId = ch.id;
  currentChannelType = ch.type;
  currentChannelNameEl.textContent = (ch.type === 'voice' ? '🔊 ' : '# ') + ch.name;
  renderChannelList();

  if (ch.type === 'text') {
    textView.classList.remove('hidden');
    voiceView.classList.add('hidden');
    messagesContainer.innerHTML = '';
    socket.emit('get-channel-messages', ch.id);
  } else {
    textView.classList.add('hidden');
    voiceView.classList.remove('hidden');
    joinVoice(ch.id);
  }
}

// ===== CREATE SERVER =====
document.getElementById('openCreateServer').addEventListener('click', () => createServerModal.classList.remove('hidden'));
document.getElementById('cancelCreateServer').addEventListener('click', () => createServerModal.classList.add('hidden'));
document.getElementById('newServerPrivate').addEventListener('change', (e) => {
  document.getElementById('newServerPassword').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('confirmCreateServer').addEventListener('click', () => {
  const name = document.getElementById('newServerName').value.trim();
  const isPrivate = document.getElementById('newServerPrivate').checked;
  const password = document.getElementById('newServerPassword').value;
  if (!name) return;
  socket.emit('create-server', { name, isPrivate, password });
  createServerModal.classList.add('hidden');
  document.getElementById('newServerName').value = '';
  document.getElementById('newServerPassword').value = '';
  document.getElementById('newServerPrivate').checked = false;
});
socket.on('server-created', ({ serverId, inviteCode }) => {
  document.getElementById('inviteCodeText').textContent = inviteCode;
  inviteModal.classList.remove('hidden');
  selectServer(serverId);
});
document.getElementById('closeInviteModal').addEventListener('click', () => inviteModal.classList.add('hidden'));

// ===== JOIN SERVER (invite code) =====
document.getElementById('openJoinServer').addEventListener('click', () => joinServerModal.classList.remove('hidden'));
document.getElementById('cancelJoinServer').addEventListener('click', () => joinServerModal.classList.add('hidden'));
document.getElementById('confirmJoinServer').addEventListener('click', () => {
  const serverId = document.getElementById('joinServerId').value.trim();
  const password = document.getElementById('joinServerPassword').value;
  if (!serverId) return;
  socket.emit('join-server', { serverId, password });
});
socket.on('joined-server', ({ serverId }) => {
  joinServerModal.classList.add('hidden');
  document.getElementById('joinServerId').value = '';
  document.getElementById('joinServerPassword').value = '';
  selectServer(serverId);
});
socket.on('error-msg', (msg) => alert(msg));

// ===== CREATE CHANNEL =====
document.getElementById('cancelCreateChannel').addEventListener('click', () => createChannelModal.classList.add('hidden'));
document.getElementById('confirmCreateChannel').addEventListener('click', () => {
  const name = document.getElementById('newChannelName').value.trim();
  const type = document.querySelector('input[name="chType"]:checked').value;
  if (!name || !currentServerId) return;
  socket.emit('create-channel', { serverId: currentServerId, name, type });
  createChannelModal.classList.add('hidden');
  document.getElementById('newChannelName').value = '';
});

// ===== CHAT =====
socket.on('channel-messages', ({ channelId, messages }) => {
  if (channelId !== currentChannelId) return;
  messagesContainer.innerHTML = '';
  messages.forEach(renderMessage);
  scrollToBottom();
});
socket.on('new-message', ({ channelId, message }) => {
  if (channelId !== currentChannelId) return;
  renderMessage(message);
  scrollToBottom();
});

function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = 'message-row';
  const time = new Date(msg.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  row.innerHTML = `
    <div class="avatar">${escapeHtml(msg.user.charAt(0).toUpperCase())}</div>
    <div class="body">
      <span class="author">${escapeHtml(msg.user)}</span><span class="time">${time}</span>
      <div class="text">${escapeHtml(msg.text)}</div>
    </div>`;
  messagesContainer.appendChild(row);
}

function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

function sendMessage() {
  const text = messageInput.value;
  if (!text.trim() || !currentChannelId) return;
  socket.emit('send-message', { channelId: currentChannelId, text });
  messageInput.value = '';
}
sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== VOICE / VIDEO / SCREEN SHARE (WebRTC mesh) =====
async function joinVoice(channelId) {
  videoGrid.innerHTML = '';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Não foi possível acessar o microfone: ' + err.message);
    localStream = new MediaStream();
  }
  addLocalTile();
  socket.emit('join-voice', channelId);
}

function addLocalTile() {
  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = 'tile-local';
  const video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.srcObject = localStream;
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = username + ' (você)';
  tile.appendChild(video); tile.appendChild(label);
  videoGrid.appendChild(tile);
}

socket.on('voice-existing-peers', (peerList) => {
  peerList.forEach(p => {
    peerUsernames[p.socketId] = p.username;
    createPeerConnection(p.socketId, true);
  });
});

socket.on('voice-peer-joined', ({ socketId, username: uname }) => {
  peerUsernames[socketId] = uname;
  createPeerConnection(socketId, false);
});

socket.on('voice-peer-left', ({ socketId }) => {
  if (peers[socketId]) { peers[socketId].close(); delete peers[socketId]; }
  const tile = document.getElementById('tile-' + socketId);
  if (tile) tile.remove();
});

socket.on('voice-signal', async ({ from, data, username: uname }) => {
  if (!peers[from]) {
    peerUsernames[from] = uname;
    createPeerConnection(from, false);
  }
  const pc = peers[from];
  if (data.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('voice-signal', { to: from, data: pc.localDescription });
  } else if (data.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
  } else if (data.candidate) {
    try { await pc.addIceCandidate(data); } catch (e) {}
  }
});

function createPeerConnection(peerId, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[peerId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('voice-signal', { to: peerId, data: e.candidate });
  };

  pc.ontrack = (e) => {
    let tile = document.getElementById('tile-' + peerId);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'video-tile';
      tile.id = 'tile-' + peerId;
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true;
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = peerUsernames[peerId] || 'Usuário';
      tile.appendChild(video); tile.appendChild(label);
      videoGrid.appendChild(tile);
    }
    const videoEl = tile.querySelector('video');
    videoEl.srcObject = e.streams[0];
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice-signal', { to: peerId, data: pc.localDescription });
    };
  }

  return pc;
}

function leaveVoice() {
  if (!currentChannelId) return;
  socket.emit('leave-voice', currentChannelId);
  Object.keys(peers).forEach(id => { peers[id].close(); delete peers[id]; });
  videoGrid.innerHTML = '';
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  localStream = null; screenStream = null; isScreenSharing = false;
}

document.getElementById('leaveVoiceBtn').addEventListener('click', () => {
  leaveVoice();
  textView.classList.remove('hidden');
  voiceView.classList.add('hidden');
  currentChannelId = null;
  currentChannelType = null;
  currentChannelNameEl.textContent = 'Bem-vindo ao AngelCord';
  renderChannelList();
});

document.getElementById('toggleMicBtn').addEventListener('click', (e) => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  e.target.classList.toggle('active', micOn);
  e.target.textContent = micOn ? '🎤 Mic' : '🔇 Mudo';
});

document.getElementById('toggleCamBtn').addEventListener('click', async (e) => {
  if (!camOn) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      localStream.addTrack(track);
      Object.values(peers).forEach(pc => pc.addTrack(track, localStream));
      const localVideo = document.querySelector('#tile-local video');
      localVideo.srcObject = localStream;
      camOn = true;
      e.target.classList.add('active');
    } catch (err) {
      alert('Não foi possível acessar a câmera: ' + err.message);
    }
  } else {
    localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
    camOn = false;
    e.target.classList.remove('active');
  }
});

document.getElementById('toggleScreenBtn').addEventListener('click', async (e) => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        else pc.addTrack(screenTrack, localStream);
      });
      const localVideo = document.querySelector('#tile-local video');
      localVideo.srcObject = screenStream;
      isScreenSharing = true;
      e.target.classList.add('active');
      if (currentChannelId) socket.emit('screen-share-status', { channelId: currentChannelId, sharing: true });

      screenTrack.onended = () => stopScreenShare(e.target);
    } catch (err) {
      // usuário cancelou o picker, sem problema
    }
  } else {
    stopScreenShare(e.target);
  }
});

function stopScreenShare(btn) {
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  isScreenSharing = false;
  btn.classList.remove('active');
  const camTrack = localStream ? localStream.getVideoTracks()[0] : null;
  Object.values(peers).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(camTrack || null);
  });
  const localVideo = document.querySelector('#tile-local video');
  if (localVideo) localVideo.srcObject = localStream;
  if (currentChannelId) socket.emit('screen-share-status', { channelId: currentChannelId, sharing: false });
}

window.addEventListener('beforeunload', () => { if (currentChannelType === 'voice') leaveVoice(); });
