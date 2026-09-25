// Assemble byte-identical transport parts: hosting may ignore HTTP ranges.
// A local object URL makes the whole recording seekable without server support.
// Each watch page declares its recording on the load button: data-parts,
// data-last-part (bytes in the final part), data-sha256 and data-size.
(() => {
  const video = document.querySelector('#scene-video');
  const button = document.querySelector('#load-video');
  const status = document.querySelector('#video-status');
  const {parts: partCount, lastPart, sha256, size} = button.dataset;
  const total = Number(partCount);
  let objectUrl;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = `Loading the complete ${size} recording…`;
    try {
      const url = document.querySelector('#original-video').href;
      const parts = [];
      for (let part = 0; part < total; part++) {
        status.textContent = `Loading recording: part ${part + 1} of ${total}…`;
        const response = await fetch(`${url}.part${part}.bin`, {cache: 'force-cache'});
        if (!response.ok) throw new Error('Download failed');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== (part < total - 1 ? 3145728 : Number(lastPart))) throw new Error('Unexpected recording part');
        parts.push(bytes);
      }
      const blob = new Blob(parts, {type: 'video/mp4'});
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== sha256) throw new Error('Unexpected recording');
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      video.load();
      button.hidden = true;
      status.textContent = 'Ready. Press play when you want; the full recording is available for scrubbing.';
    } catch {
      button.disabled = false;
      status.textContent = 'Could not load the recording. Retry, or use the original MP4 download below.';
    }
  });
  video.addEventListener('error', () => {
    status.textContent = 'This browser could not play the recording. Use the original MP4 download below.';
  });
  document.querySelector('#speed').addEventListener('change', event => {
    video.defaultPlaybackRate = Number(event.target.value);
    video.playbackRate = video.defaultPlaybackRate;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  window.addEventListener('pagehide', event => { if (!event.persisted && objectUrl) URL.revokeObjectURL(objectUrl); });
})();
