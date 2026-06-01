'use client';

import dynamic from 'next/dynamic';

// The whole game is client-only: it reads localStorage during render and paints
// to <canvas>, so it must never run on the server. ssr:false mounts it only in
// the browser, mirroring the original in-browser-Babel setup.
const App = dynamic(() => import('@/presentation/App'), { ssr: false });

export default function Page() {
  return <App />;
}
