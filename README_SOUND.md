This small note documents the new "Enable sound" and trash-overlay behavior added to the game.

How it works:
- A new audio unlock button is added to the UI (you can add it to your HTML). When clicked it calls `enableSound()` which plays and pauses a short silent audio to satisfy browser user-gesture requirements.
- The game's `triggerBombFlash()` already plays `bombAudio` when bombs hit.
- `triggerTrashOverlay()` sets a `trashOverlay` flag and clears it after 350ms. The draw loop paints a semi-opaque grey rectangle (rgba(0,0,0,0.7) with 70% opacity) over the canvas while `trashOverlay` is true.

If you want me to, I can patch `index.html` and `styles/style.css` now to add an `Enable sound` button and styles. Otherwise you can add a button that calls `enableSound()` on click.
