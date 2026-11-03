/** The pin/follow star: filled when on, outlined when off. */
export default function Star({ on }: { on: boolean }) {
  return (
    <svg class="star" viewBox="0 0 24 24" width="18" height="18" fill={on ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z" />
    </svg>
  );
}
