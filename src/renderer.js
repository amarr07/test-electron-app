let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let startTime;
let timerInterval;

const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const statusElement = document.getElementById('status');
const timerElement = document.getElementById('timer');
const messageElement = document.getElementById('message');

function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        ''
    ];
    
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

function updateTimer() {
    if (!startTime) return;
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

playBtn.addEventListener('click', async () => {
    try {
        messageElement.textContent = '🎤 Requesting microphone access...';
        messageElement.style.color = '#666';
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        let micDeviceId = null;
        for (const device of audioInputs) {
            const label = device.label.toLowerCase();
            if (!label.includes('stereo mix') && 
                (label.includes('microphone') || label.includes('mic') || label.includes('array'))) {
                micDeviceId = device.deviceId;
                break;
            }
        }
        
        const micConstraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };
        
        if (micDeviceId) {
            micConstraints.audio.deviceId = { exact: micDeviceId };
        }
        
        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);

        let systemStream = null;
        let hasSystemAudio = false;
        
        try {
            messageElement.textContent = '🖥️ Select screen and CHECK "Share audio" box...';
            systemStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { max: 1 },
                    height: { max: 1 },
                    frameRate: { max: 1 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            hasSystemAudio = systemStream.getAudioTracks().length > 0;
            systemStream.getVideoTracks().forEach(track => track.stop());
            
        } catch (e) {
            messageElement.textContent = '⚠️ System audio not available, recording microphone only';
        }

        const audioContext = new AudioContext();
        await audioContext.resume();
        
        const destination = audioContext.createMediaStreamDestination();
        const micGain = audioContext.createGain();
        const systemGain = audioContext.createGain();
        
        micGain.gain.value = 1.0;
        systemGain.gain.value = 1.0;
        
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(micGain);
        micGain.connect(destination);

        if (hasSystemAudio && systemStream) {
            const systemSource = audioContext.createMediaStreamSource(systemStream);
            systemSource.connect(systemGain);
            systemGain.connect(destination);
        }

        window.activeStreams = {
            mic: micStream,
            system: systemStream,
            audioContext: audioContext
        };

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };

        mediaRecorder = new MediaRecorder(destination.stream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const recordedMimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: recordedMimeType });
            const arrayBuffer = await audioBlob.arrayBuffer();
            
            if (window.electronAPI) {
                const result = await window.electronAPI.saveAudio(arrayBuffer);
                if (result.success) {
                    messageElement.textContent = `✅ Saved: ${result.path}`;
                    messageElement.style.color = '#4CAF50';
                } else {
                    messageElement.textContent = '❌ Save cancelled';
                    messageElement.style.color = '#f44336';
                }
            }
            
            clearInterval(timerInterval);
        };

        mediaRecorder.start(1000);
        
        isRecording = true;
        isPaused = false;
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 100);

        statusElement.textContent = '🔴 Recording...';
        statusElement.style.color = '#f44336';
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        
        if (hasSystemAudio) {
            messageElement.textContent = '✅ Capturing: Microphone + System Audio';
            messageElement.style.color = '#4CAF50';
        } else {
            messageElement.textContent = '✅ Capturing: Microphone Only';
            messageElement.style.color = '#ff9800';
        }

    } catch (error) {
        statusElement.textContent = 'Error: ' + error.message;
        statusElement.style.color = '#f44336';
        
        if (error.message.includes('Permission denied') || error.name === 'NotAllowedError') {
            messageElement.textContent = '⚠️ Permission denied. Please allow microphone and screen sharing.';
        } else {
            messageElement.textContent = '⚠️ Error: ' + error.message;
        }
        messageElement.style.color = '#f44336';
        
        if (window.activeStreams) {
            if (window.activeStreams.mic) {
                window.activeStreams.mic.getTracks().forEach(track => track.stop());
            }
            if (window.activeStreams.system) {
                window.activeStreams.system.getTracks().forEach(track => track.stop());
            }
            if (window.activeStreams.audioContext) {
                window.activeStreams.audioContext.close();
            }
            window.activeStreams = null;
        }
    }
});

pauseBtn.addEventListener('click', () => {
    if (!mediaRecorder) return;

    if (isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        statusElement.textContent = '🔴 Recording...';
        statusElement.style.color = '#f44336';
        pauseBtn.innerHTML = '<span>⏸</span> Pause';
    } else {
        mediaRecorder.pause();
        isPaused = true;
        statusElement.textContent = '⏸️ Paused';
        statusElement.style.color = '#ff9800';
        pauseBtn.innerHTML = '<span>▶</span> Resume';
    }
});

stopBtn.addEventListener('click', () => {
    if (!mediaRecorder) return;

    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    if (window.activeStreams) {
        if (window.activeStreams.mic) {
            window.activeStreams.mic.getTracks().forEach(track => track.stop());
        }
        if (window.activeStreams.system) {
            window.activeStreams.system.getTracks().forEach(track => track.stop());
        }
        if (window.activeStreams.audioContext) {
            window.activeStreams.audioContext.close();
        }
        window.activeStreams = null;
    }
    
    isRecording = false;
    isPaused = false;

    statusElement.textContent = 'Ready to Record';
    statusElement.style.color = '#4CAF50';
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    pauseBtn.innerHTML = '<span>⏸</span> Pause';
    timerElement.textContent = '00:00';
});
