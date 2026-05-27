export class AudioExporter {
  static async exportToWav(audioContext: AudioContext, recordDuration: number, motifEngine: any): Promise<Blob> {
    const offlineCtx = new OfflineAudioContext(
      2,
      audioContext.sampleRate * recordDuration,
      audioContext.sampleRate
    );

    // Swap engine context to offline ctx temporarily
    const originalCtx = motifEngine.synthesisEngine.audioContext;
    motifEngine.synthesisEngine.audioContext = offlineCtx;
    motifEngine.synthesisEngine.masterGain.disconnect();
    motifEngine.synthesisEngine.masterGain.connect(offlineCtx.destination);
    
    // Play in offline context
    motifEngine.synthesisEngine.startTime = offlineCtx.currentTime + 0.1;
    motifEngine.synthesisEngine.isPlaying = true;
    motifEngine.synthesisEngine.schedulerIntervalId = -1 as any;
    motifEngine.synthesisEngine.schedulePlayback();

    const renderedBuffer = await offlineCtx.startRendering();

    // Restore
    motifEngine.synthesisEngine.audioContext = originalCtx;
    motifEngine.synthesisEngine.masterGain.disconnect();
    motifEngine.synthesisEngine.masterGain.connect(originalCtx.destination);
    motifEngine.synthesisEngine.isPlaying = false;

    return this.audioBufferToWav(renderedBuffer);
  }

  static audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const length = buffer.length * blockAlign;
    const dataSize = length;
    const bufferArray = new ArrayBuffer(44 + dataSize);
    const view = new DataView(bufferArray);

    function writeString(offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const offset = 44;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = Math.max(-1, Math.min(1, channels[c][i]));
        sample = sample < 0 ? sample * 32768 : sample * 32767;
        view.setInt16(offset + (i * numChannels + c) * bytesPerSample, sample, true);
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
