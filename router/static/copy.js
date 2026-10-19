// The copy button under "For agents". One button, one target: the id in
// data-copy names the element whose text is copied.
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy);
    if (target === null) return;
    const text = target.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      // No clipboard permission, or an insecure context. Select the prompt so
      // the usual copy key does the work.
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Press Ctrl+C";
    }
    setTimeout(() => {
      button.textContent = "Copy";
    }, 2000);
  });
}
