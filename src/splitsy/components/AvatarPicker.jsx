import { useState } from 'react'
import { PhotoInput, GalleryInput, Spinner, useObjectURL, Mascot, Avatar } from './ui'
import Icon from './Icon'
import { compressAvatar, formatBytes } from '../lib/image'

/**
 * Profile photo picker: take a selfie OR upload from the gallery.
 * The photo is cropped to a square and compressed before it's used.
 */
export default function AvatarPicker({ value, onChange, user, size = 168, busy = false }) {
  const [working, setWorking] = useState(false)
  const [info, setInfo] = useState(null)
  const preview = useObjectURL(value)

  const pick = async (file) => {
    if (!file) return
    setWorking(true)
    try {
      const small = await compressAvatar(file)
      setInfo({ before: file.size, after: small.size })
      onChange(small)
    } catch {
      setInfo(null)
    } finally {
      setWorking(false)
    }
  }

  const loading = working || busy
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="rounded-full p-1.5 grad-warm shadow-pop" style={{ width: size, height: size }}>
          <div className="w-full h-full rounded-full bg-white grid place-items-center overflow-hidden">
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : user ? (
              <Avatar user={user} size={size - 12} />
            ) : (
              <Mascot name="bubble" size={size * 0.62} anim="none" />
            )}
          </div>
        </div>
        {loading && (
          <div className="absolute inset-1.5 rounded-full bg-ink/40 grid place-items-center">
            <Spinner light size={28} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <PhotoInput facing="user" onPick={pick} className="tap h-11 px-4 rounded-full bg-ink text-white font-bold text-[14px] flex items-center gap-2">
          <Icon name="camera" size={18} /> Take a selfie
        </PhotoInput>
        <GalleryInput multiple={false} onPick={pick} className="tap h-11 px-4 rounded-full bg-ink text-white font-bold text-[14px] flex items-center gap-2">
          <Icon name="upload" size={18} /> Upload photo
        </GalleryInput>
      </div>

      <p className="text-[12px] font-semibold text-ink-soft text-center min-h-4">
        {working
          ? 'Compressing your photo…'
          : info
            ? <span className="inline-flex items-center gap-1 text-green"><Icon name="check" size={14} stroke={3} /> Compressed {formatBytes(info.before)} → {formatBytes(info.after)}</span>
            : 'Square-cropped and compressed automatically'}
      </p>
    </div>
  )
}
