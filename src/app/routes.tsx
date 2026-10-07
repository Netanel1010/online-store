import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RootLayout } from '@/layouts/RootLayout'
import { CartPage } from '@/pages/CartPage'
import { CategoryPage } from '@/pages/CategoryPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { SearchPage } from '@/pages/SearchPage'

// The sign-in, registration and checkout pages are the only ones that use the form libraries, and
// most visits never reach them, so they load on demand instead of with the first page. So do the
// pages of the orders, which only a visitor who has ordered something sees.
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const CheckoutPage = lazy(() =>
  import('@/pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
)
const MyOrdersPage = lazy(() =>
  import('@/pages/MyOrdersPage').then((m) => ({ default: m.MyOrdersPage })),
)
const OrderPage = lazy(() => import('@/pages/OrderPage').then((m) => ({ default: m.OrderPage })))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="category/:categoryId" element={<CategoryPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<MyOrdersPage />} />
          <Route path="orders/:orderNumber" element={<OrderPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
