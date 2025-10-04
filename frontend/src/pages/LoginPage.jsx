import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Satellite, Eye, EyeOff, User, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import CosmicBackdrop from '../components/CosmicBackdrop'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, register, isLoading } = useAuthStore()
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'operator'
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (isLogin) {
      const result = await login(formData.email, formData.password)
      if (result.success) {
        navigate('/dashboard')
      }
    } else {
      const result = await register(formData.email, formData.password, formData.role)
      if (result.success) {
        navigate('/dashboard')
      }
    }
  }

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const demoCredentials = [
    { role: 'Operator', email: 'operator@orbitalos.com', password: 'password123' },
    { role: 'Insurer', email: 'insurer@orbitalos.com', password: 'password123' },
    { role: 'Analyst', email: 'analyst@orbitalos.com', password: 'password123' },
  ]

  const fillDemoCredentials = (email, password) => {
    setFormData({ ...formData, email, password })
    toast.success('Demo credentials filled!')
  }

  return (
    <div className="relative min-h-screen flex text-white overflow-hidden">
      <CosmicBackdrop />
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-indigo-900/70 to-slate-950/80 backdrop-blur-xl" />
        <div className="absolute inset-0 opacity-60 mix-blend-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%)]" />
        <div className="absolute inset-0 opacity-40 blur-3xl bg-[radial-gradient(circle_at_20%_80%,_rgba(14,165,233,0.45),_transparent_65%)]" />
        <div className="relative z-10 text-center px-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Satellite className="h-24 w-24 mx-auto mb-8" />
            <h1 className="text-4xl font-bold mb-4">OrbitalOS</h1>
            <p className="text-xl opacity-90">Predict. Prevent. Protect.</p>
            <p className="text-lg opacity-80 mt-4 max-w-md">
              Secure satellite operations with AI-driven collision prediction and intelligent booking system.
            </p>
          </motion.div>
        </div>
        
        {/* Animated background elements */}
        <div className="absolute top-1/4 left-1/4 w-36 h-36 bg-sky-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-52 h-52 bg-fuchsia-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Right side - Login Form */}
      <div className="relative w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md lg:bg-black/30" />
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 w-full max-w-md space-y-6"
        >
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center space-x-2 text-blue-500 hover:text-blue-400 transition-colors">
              <Satellite className="h-6 w-6" />
              <span className="text-xl font-bold">OrbitalOS</span>
            </Link>
            <h2 className="text-2xl font-bold mt-4 mb-2">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-300/80">
              {isLogin ? 'Sign in to your account' : 'Join the future of satellite operations'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div>
                <label className="label">Role</label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="input bg-white/5 border-white/10 focus:border-sky-400"
                  required
                >
                  <option value="operator">Operator</option>
                  <option value="insurer">Insurer</option>
                  <option value="analyst">Analyst</option>
                </select>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="input pl-10 bg-white/5 border-white/10 focus:border-sky-400"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="input pl-10 pr-10 bg-white/5 border-white/10 focus:border-sky-400"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-500 hover:text-blue-400 transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>

          {/* Demo Credentials */}
          <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
            <h3 className="text-sm font-medium text-white/80 mb-3">Demo Credentials</h3>
            <div className="space-y-2">
              {demoCredentials.map((cred, index) => (
                <button
                  key={index}
                  onClick={() => fillDemoCredentials(cred.email, cred.password)}
                  className="w-full text-left p-2 text-sm bg-white/5 hover:bg-white/10 rounded transition-colors"
                >
                  <div className="font-medium text-sky-400">{cred.role}</div>
                  <div className="text-slate-300/80">{cred.email}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default LoginPage
