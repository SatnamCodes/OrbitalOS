import React from 'react'
import Navigation from './Navigation'
import GlobalHeader from './GlobalHeader'
import CosmicBackdrop from './CosmicBackdrop'

function Layout({ children }) {
  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      <CosmicBackdrop />
      <div className="relative z-10 flex min-h-screen flex-col">
        <GlobalHeader />
        <main className="flex-1 pt-28 pb-20 px-4 sm:px-6 lg:px-10">
          {children}
        </main>
        <Navigation />
      </div>
    </div>
  )
}

export default Layout