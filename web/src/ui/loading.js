// Thin progress bar along the top of the page; concurrent tasks share it.
const tasks = new Set();
let el;

function render() {
  el ||= Object.assign(document.body.appendChild(document.createElement('div')), {
    className: 'loader-container',
    innerHTML: '<div class="loader-bar"></div>',
  });
  const bar = el.firstChild;
  if (!tasks.size) {
    bar.style.width = '100%';
    el.classList.add('done');
    return;
  }
  el.classList.remove('done');
  const progress = [...tasks].reduce((a, t) => a + t.progress, 0) / tasks.size;
  bar.style.width = `${Math.max(5, progress * 100)}%`;
}

export function loading() {
  const task = { progress: 0 };
  tasks.add(task);
  render();
  return {
    update(p) { task.progress = p; render(); },
    done() { tasks.delete(task); render(); },
  };
}

/** Shows the bar while `promise` is pending. */
export async function track(promise) {
  const t = loading();
  try { return await promise; } finally { t.done(); }
}
