import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navbar />
      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '52px 48px' }}>
        <Outlet />
      </main>
    </div>
  )
}
