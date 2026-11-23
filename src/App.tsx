import { matchPath, usePath } from './router'
import { Layout } from './components/Layout'
import { ConfirmProvider, EmptyState, ToastProvider } from './components/ui'
import { Link } from './router'
import { AppStoreProvider } from './store/AppStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import FavoritesPage from './pages/FavoritesPage'
import TripsPage from './pages/TripsPage'
import ManagePage from './pages/ManagePage'
import EventFormPage from './pages/EventFormPage'

function Routes({ path }: { path: string }) {
  let m: Record<string, string> | null
  if (matchPath('/events', path)) return <EventsPage />
  if ((m = matchPath('/events/:id', path))) return <EventDetailPage key={`e:${m.id}`} id={m.id} />
  if (matchPath('/favorites', path)) return <FavoritesPage />
  if (matchPath('/trips', path)) return <TripsPage key="active" />
  if ((m = matchPath('/trips/:id', path))) return <TripsPage key={`t:${m.id}`} tripId={m.id} />
  if (matchPath('/manage', path)) return <ManagePage />
  if (matchPath('/manage/new', path)) return <EventFormPage key="new" />
  if ((m = matchPath('/manage/edit/:id', path))) return <EventFormPage key={`edit:${m.id}`} id={m.id} />
  return <EmptyState icon="🧭" title="페이지를 찾을 수 없어요" action={<Link to="/events" className="btn btn--primary btn--md">행사 목록으로</Link>} />
}

export default function App() {
  const path = usePath()
  return (
    <AppStoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Layout path={path}>
            <ErrorBoundary resetKey={path}>
              <Routes path={path} />
            </ErrorBoundary>
          </Layout>
        </ConfirmProvider>
      </ToastProvider>
    </AppStoreProvider>
  )
}
