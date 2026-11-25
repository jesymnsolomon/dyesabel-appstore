import { useEffect } from 'react'
import { AuthProvider, useAuth, takePendingJoin } from './auth'
import { useRoute, match, navigate } from './lib/router'
import { ToastProvider } from './components/ui'
import Welcome from './screens/Welcome'
import SignUp from './screens/SignUp'
import SignIn from './screens/SignIn'
import Home from './screens/Home'
import CreateGroup from './screens/CreateGroup'
import Invite from './screens/Invite'
import Join from './screens/Join'
import Group from './screens/Group'
import AddExpense from './screens/AddExpense'
import ExpenseDetail from './screens/ExpenseDetail'
import Profile from './screens/Profile'
import Admin from './screens/Admin'

function Router() {
  const { user, ready } = useAuth()
  const path = useRoute()

  // After signing in, finish any invite the user opened while signed out
  useEffect(() => {
    if (!user) return
    const code = takePendingJoin()
    if (code) navigate(`/join/${code}`, { replace: true })
  }, [user])

  if (!ready) {
    return (
      <div className="min-h-[100dvh] grid place-items-center">
        <img src="/apps/splitsy/logo.svg" alt="Splitsy" className="w-28 animate-float" />
      </div>
    )
  }

  let m
  if ((m = match('/join/:code', path))) return <Join code={m.code} />

  if (!user) {
    if (path === '/signup') return <SignUp />
    if (path === '/signin') return <SignIn />
    return <Welcome />
  }

  if (path === '/admin') return <Admin />
  if (path === '/new-group') return <CreateGroup />
  if (path === '/profile') return <Profile />
  if ((m = match('/group/:id/add', path))) return <AddExpense groupId={m.id} key={path} />
  if ((m = match('/group/:id/invite', path))) return <Invite groupId={m.id} />
  if ((m = match('/group/:id', path))) return <Group groupId={m.id} key={m.id} />
  if ((m = match('/expense/:id', path))) return <ExpenseDetail expenseId={m.id} key={m.id} />
  return <Home />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router />
      </ToastProvider>
    </AuthProvider>
  )
}
