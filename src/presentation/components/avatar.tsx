'use client';

/* ============================================================
   Presentation · Avatar — base character + collected pieces
   Each layer is its own stacked canvas so palette recolor of the
   base never bleeds into accessory colors.
   ============================================================ */

import React from 'react';
import { PixelSprite, AVATAR_BASES } from './sprites';
import { PIECE_ORDER, PIECES } from '../../domain/catalog';
import type { PieceId } from '../../domain/types';

interface AvatarProps {
  baseId?: string;
  pieces?: PieceId[];
  scale?: number;
  bob?: boolean;
  popId?: PieceId | null;
  className?: string;
  style?: React.CSSProperties;
}

export function Avatar({ baseId = 'explorer', pieces = [], scale = 8, bob, popId, className = '', style = {} }: AvatarProps) {
  const base = AVATAR_BASES.find(b => b.id === baseId) || AVATAR_BASES[0];
  const size = 16 * scale;
  const ordered = PIECE_ORDER.filter(id => pieces.includes(id));
  return (
    <div className={'avatar ' + (bob ? 'bob ' : '') + className}
         style={{ position: 'relative', width: size, height: size, ...style }}>
      <PixelSprite layers={['buddy']} scale={scale} pal={base.pal}
                   style={{ position: 'absolute', inset: 0 }} />
      {ordered.map(id => (
        <PixelSprite key={id} layers={[PIECES[id].sprite]} scale={scale}
                     className={popId === id ? 'pop' : ''}
                     style={{ position: 'absolute', inset: 0 }} />
      ))}
    </div>
  );
}

interface AvatarStageProps {
  baseId?: string;
  pieces?: PieceId[];
  scale?: number;
  popId?: PieceId | null;
  bob?: boolean;
}

/* shadow disc to ground the avatar */
export function AvatarStage({ baseId, pieces, scale = 9, popId, bob = true }: AvatarStageProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <Avatar baseId={baseId} pieces={pieces} scale={scale} bob={bob} popId={popId} />
      <div style={{
        width: 16 * scale * .7, height: 10, marginTop: 6, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(0,0,0,.5), transparent)',
      }}></div>
    </div>
  );
}
