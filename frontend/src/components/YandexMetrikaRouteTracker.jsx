import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const COUNTER_ID = 111271531

export default function YandexMetrikaRouteTracker() {
  const location = useLocation()
  const initialLocation = useRef(true)

  useEffect(() => {
    if (initialLocation.current) {
      initialLocation.current = false
      return
    }

    if (typeof window.ym === 'function') {
      window.ym(COUNTER_ID, 'hit', window.location.href)
    }
  }, [location.pathname, location.search, location.hash])

  return null
}
