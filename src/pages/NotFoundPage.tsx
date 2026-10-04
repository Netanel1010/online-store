import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1 className="text-3xl font-bold">הדף לא נמצא</h1>
      <p className="mt-2 text-slate-600">הכתובת שביקשת אינה קיימת.</p>
      <Link to="/" className="mt-4 inline-block text-blue-700 underline">
        חזרה לדף הבית
      </Link>
    </section>
  )
}
