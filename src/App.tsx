import { matchPath, usePath } from './router'
import { Layout } from './components/Layout'
import { ConfirmProvider, EmptyState, ToastProvider } from './components/ui'
import { Link } from './router'
import { AppStoreProvider } from './store/AppStore'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import FavoritesPage from './pages/FavoritesPage'
import TripsPage from './pages/TripsPage'
import ManagePage from './pages/ManagePage'
import EventFormPage from './pages/EventFormPage'

function Routes({ path }: { path: string }) {
  let m: Record<string, string> | null
  if (matchPath('/events', path)) return <EventsPage />
  if ((m = matchPath('/events/:id', path))) return <EventDetailPage id={m.id} />
  if (matchPath('/favorites', path)) return <FavoritesPage />
  if (matchPath('/trips', path)) return <TripsPage />
  if ((m = matchPath('/trips/:id', path))) return <TripsPage tripId={m.id} />
  if (matchPath('/manage', path)) return <ManagePage />
  if (matchPath('/manage/new', path)) return <EventFormPage />
  if ((m = matchPath('/manage/edit/:id', path))) return <EventFormPage id={m.id} />
  return <EmptyState icon="🧭" title="페이지를 찾을 수 없어요" action={<Link to="/events" className="btn btn--primary btn--md">행사 목록으로</Link>} />
}

export default function App() {
  const path = usePath()
  return (
    <AppStoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Layout path={path}>
            <Routes path={path} />
          </Layout>
        </ConfirmProvider>
      </ToastProvider>
    </AppStoreProvider>
  )
}
