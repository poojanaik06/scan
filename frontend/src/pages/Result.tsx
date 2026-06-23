import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'

const Result: React.FC = () => {
  const loc = useLocation()
  const payload = (loc.state as any) || {}
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    async function verify() {
      // If payload has certificateId and token
      if (payload.certificateId && payload.token) {
        try {
          const res = await axios.post('/api/verify', {
            certificateId: payload.certificateId,
            token: payload.token
          })
          setResult(res.data)
        } catch (e: any) {
          setResult({ status: 'error', message: e.message })
        }
      } else if (payload.raw) {
        setResult({ status: 'unknown', raw: payload.raw })
      } else {
        setResult({ status: 'invalid', message: 'No payload' })
      }
    }
    verify()
  }, [payload])

  if (!result) return <div className="p-4">Verifying...</div>

  return (
    <div className="p-4">
      <h2 className="text-xl mb-2">Verification Result</h2>
      <pre className="bg-gray-100 p-2 rounded">{JSON.stringify(result, null, 2)}</pre>
    </div>
  )
}

export default Result
