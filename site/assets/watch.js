// Buffer the unchanged original once: the static host may ignore HTTP ranges.
// A local object URL makes the whole recording seekable without server support.
(() => {
  const video = document.querySelector('#scene-video');
  const button = document.querySelector('#load-video');
  const status = document.querySelector('#video-status');
  let objectUrl;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Loading the complete 13.9 MB recording…';
    try {
      const response = await fetch(document.querySelector('#original-video').href, {cache: 'force-cache'});
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      if (blob.size !== 13924666 || !blob.type.startsWith('video/mp4')) throw new Error('Unexpected recording');
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
