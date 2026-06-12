'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy scanner route — now redirects to the staff page
export default function ScannerPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/staff'); }, [router]);
  return null;
}
