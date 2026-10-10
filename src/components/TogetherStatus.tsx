import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearTogetherLocation, listTogetherLocations, upsertTogetherLocation, type TogetherLocationRow } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import { useToast } from './Toast'
import { useFriends } from '../store/friends'
import { useSession } from '../store/session'

const EARTH_METERS = 6_371_000

function distanceMeters(a: TogetherLocationRow, b: TogetherLocationRow): number {
  const radians = Math.PI / 180
  const lat1 = a.latitude * radians
  const lat2 = b.latitude * radians
  const deltaLat = (b.latitude - a.latitude) * radians
  const deltaLon = (b.longitude - a.longitude) * radians
  const term = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return EARTH_METERS * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term))
}

export default function TogetherStatus() {
  const toast = useToast()
  const { memberId, role } = useSession()
  const { friends } = useFriends()
  const friendId = friends.find((friend) => friend.memberId !== '__admin__')?.memberId ?? null
  const [sharing, setSharing] = useState(false)
  const [locations, setLocations] = useState<TogetherLocationRow[]>([])
  const [now, setNow] = useState(Date.now())
  const watchIdRef = useRef<number | null>(null)
  const sharingRef = useRef(false)

  const load = useCallback(async () => {
    if (!memberId || !friendId) {
      setLocations([])
      return
    }
    try {
      setLocations(await listTogetherLocations([memberId, friendId]))
    } catch {
      // Location migration may not be applied yet.
    }
  }, [memberId, friendId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [load])

  useRealtime('together-locations', [{ table: 'together_locations', on: () => void load() }], {
    enabled: Boolean(memberId && friendId),
    pollMs: 15_000,
    onPoll: () => void load(),
  })

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current)
    if (memberId && sharingRef.current) void clearTogetherLocation(memberId).catch(() => {})
  }, [memberId])

  const myLocation = locations.find((location) => location.member_id === memberId)
  const peerLocation = locations.find((location) => location.member_id === friendId)
  const locationsValid = Boolean(
    sharing && myLocation && peerLocation &&
    Date.parse(myLocation.expires_at) > now && Date.parse(peerLocation.expires_at) > now
  )
  const distance = locationsValid && myLocation && peerLocation ? distanceMeters(myLocation, peerLocation) : null
  const together = distance !== null && distance < 1_000
  const distanceLabel = distance === null ? null : `${(distance / 1_000).toFixed(2)} km`

  const stopSharing = async () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    sharingRef.current = false
    setSharing(false)
    if (memberId) await clearTogetherLocation(memberId).catch(() => {})
    await load()
  }

  const startSharing = () => {
    if (!memberId || !friendId) return toast.show('先添加好友，再开启同在检测', 'err')
    if (!window.isSecureContext || !navigator.geolocation) return toast.show('定位需要 HTTPS 环境和浏览器定位支持', 'err')
    sharingRef.current = true
    setSharing(true)
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        void upsertTogetherLocation({
          member_id: memberId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }).then(load).catch(() => toast.show('位置同步失败，请确认已应用数据库迁移', 'err'))
      },
      () => {
        sharingRef.current = false
        setSharing(false)
        toast.show('定位未获授权，请在浏览器设置中允许位置权限', 'err')
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 }
    )
    watchIdRef.current = id
  }

  const status = useMemo(() => {
    if (together) return '在一起'
    if (distance !== null) return '远'
    if (sharing) return '等Ta开启'
    return '开启同在检测'
  }, [together, distance, sharing])

  if (role !== 'her' || !memberId) return null

  return (
    <button
      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ${together ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}
      title={sharing ? '点击停止位置共享' : '点击开启位置共享；双方都开启且相距小于 1 公里时点亮'}
      onClick={() => void (sharing ? stopSharing() : startSharing())}
    >
      <span className={`text-base leading-none ${together ? 'animate-heart' : 'grayscale opacity-50'}`}>💕</span>
      <span>{status}{distanceLabel ? ` · ${distanceLabel}` : ''}</span>
    </button>
  )
}
