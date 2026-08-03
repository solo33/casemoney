import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const COUNTER_ID = 111271531

export default function YandexMetrikaRouteTracker() {
  const location = useLocation()

  useEffect(() => {
    if (typeof window.ym === 'function') {
      window.ym(COUNTER_ID, 'hit', window.location.href)
    }
  }, [location.pathname, location.search, location.hash])

  return null
}
