import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'

const Scanner: React.FC = () => {
  const divRef = useRef<HTMLDivElement | null>(null)
  const html5Ref = useRef<Html5Qrcode | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    const qrcodeRegionId = 'qr-reader'
    const html5QrCode = new Html5Qrcode(qrcodeRegionId)
    html5Ref.current = html5QrCode

    Html5Qrcode.getCameras()
      .then(cameras => {
        const cameraId = cameras && cameras.length ? cameras[0].id : undefined
        const constraints: any = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' }
        html5QrCode
          .start(constraints, { fps: 10, qrbox: 250 }, qrCodeMessage => {
            processPayload(qrCodeMessage)
            stopScanner()
          })
          .then(() => setScanning(true))
          .catch(e => setError(String(e)))
      })
      .catch(err => setError(String(err)))

    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopScanner = async () => {
    const inst = html5Ref.current
    if (inst && inst.getState && inst.getState() !== 'STOPPED') {
      try {
        await inst.stop()
      } catch (e) {
        // ignore
      }
    }
    setScanning(false)
  }

  const processPayload = (qrCodeMessage: string) => {
    try {
      const payload = JSON.parse(qrCodeMessage)
      navigate('/result', { state: payload })
    } catch (e) {
      navigate('/result', { state: { raw: qrCodeMessage } })
    }
  }

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = e => {
    setError(null)
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return setError('Could not get canvas context')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, canvas.width, canvas.height)
        if (code && code.data) {
          processPayload(code.data)
        } else {
          setError('No QR code found in the uploaded image')
        }
      }
      img.onerror = () => setError('Invalid image file')
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Scan Certificate QR</h1>
      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
      <div id="qr-reader" ref={divRef} style={{ width: '100%', minHeight: 300, background: '#000' }} />
      <div style={{ marginTop: 12 }}>
        <button onClick={() => fileInputRef.current?.click()} style={{ marginRight: 8 }}>Upload certificate image</button>
        <button onClick={() => { stopScanner(); html5Ref.current = null; }} disabled={!scanning}>Stop camera</button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

export default Scanner
