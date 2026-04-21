# Page Load Performance Optimization Plan

## 📊 **Current Performance Analysis**

### Bundle Size Analysis
Based on the successful build with bundle analyzer:

#### **Large Routes (Performance Concerns)**
- `/smartphones/[slug]` - **110 kB** (🔴 Critical)
- `/[...slug]` - **11.4 kB** (🟡 Medium)
- `/cart` - **37 kB** (🔴 High Priority)
- `/device-protection` - **34.1 kB** (🔴 High Priority)
- `/number-selection` - **26.7 kB** (🟡 Medium)

#### **Shared Bundle Issues**
- First Load JS: **102 kB** (🟡 Acceptable but can be optimized)
- Middleware: **38 kB** (🔴 High - needs optimization)

### Identified Performance Bottlenecks

## 🎯 **Priority 1: Critical Optimizations**

### 1. **Code Splitting & Lazy Loading**
**Impact**: High | **Effort**: Medium

#### Issues Found:
- Large smartphone product page (110 kB)
- Heavy cart component (37 kB)
- Large device protection module (34.1 kB)

#### Implementation:
```tsx
// Example: Lazy load heavy components
const DeviceProtectionNew = dynamic(() => import('@/components/DeviceProtectionNew'), {
  loading: () => <div>Loading protection options...</div>,
  ssr: false
});

const Cart = dynamic(() => import('@/components/Cart'), {
  loading: () => <div>Loading cart...</div>
});

const TradeInModal = dynamic(() => import('@/components/molecules/TradeInModal'), {
  ssr: false
});
```

### 2. **Image Optimization**
**Impact**: High | **Effort**: Low

#### Current Issues:
- Using `<img>` tags instead of Next.js `<Image>`
- Missing optimization for product images
- No lazy loading for images

#### Implementation:
```tsx
// Replace all img tags with Next.js Image
import Image from 'next/image';

// Before: <img src={productImage} alt="Product" />
// After:
<Image
  src={productImage}
  alt="Product"
  width={300}
  height={200}
  priority={isAboveFold}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### 3. **Bundle Analysis & Tree Shaking**
**Impact**: High | **Effort**: Medium

#### Issues Identified:
- Large middleware bundle (38 kB)
- Potential unused dependencies
- Heavy React Query devtools in production

#### Implementation:
```javascript
// next.config.mjs optimizations
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@vds/core', '@vz-nextgen/common'],
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  webpack: (config, { dev }) => {
    // Remove React Query devtools in production
    if (!dev) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@tanstack/react-query-devtools': false,
      };
    }
    return config;
  },
};
```

## 🚀 **Priority 2: Performance Enhancements**

### 4. **Server-Side Rendering Optimization**
**Impact**: Medium | **Effort**: Medium

#### Current Issues:
- Dynamic server usage errors in device-protection
- Multiple feature flag API calls blocking render
- Inefficient data fetching patterns

#### Implementation:
```tsx
// Optimize feature flag fetching
export async function generateStaticParams() {
  // Pre-generate static params for common routes
}

// Use React 18 features for better SSR
const SuspenseWrapper = ({ children, fallback }) => (
  <Suspense fallback={fallback}>
    {children}
  </Suspense>
);
```

### 5. **Caching Strategy Enhancement**
**Impact**: High | **Effort**: Low

#### Current Configuration:
```javascript
// Good existing cache headers
{
  source: '/:all*(.js|.ts|.tsx|.css|.jsx)',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    },
  ],
}
```

#### Enhanced Implementation:
```javascript
// Add ISR for dynamic content
export const revalidate = 3600; // 1 hour

// Add service worker for offline caching
const withPWA = require('next-pwa')({
  dest: 'public',
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
});
```

### 6. **Third-Party Dependencies Optimization**
**Impact**: Medium | **Effort**: Low

#### Issues:
- Large Verizon design system imports
- Heavy analytics libraries
- Multiple feature flag libraries

#### Implementation:
```tsx
// Optimize VDS imports
import { Button } from '@vds/core/Button';
import { Body } from '@vds/core/Body';
// Instead of: import { Button, Body } from '@vds/core';

// Lazy load analytics
const Analytics = dynamic(() => import('@/components/Tagging'), {
  ssr: false
});
```

## 🔧 **Priority 3: Advanced Optimizations**

### 7. **Runtime Performance**
**Impact**: Medium | **Effort**: High

#### React Query Optimization:
```tsx
// Optimize React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

#### Memoization Strategy:
```tsx
// Add React.memo for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  return <ComplexVisualization data={data} />;
});

// Use useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return heavyCalculation(data);
}, [data]);
```

### 8. **Resource Preloading**
**Impact**: Medium | **Effort**: Low

```tsx
// Preload critical resources
<link rel="preload" href="/api/critical-data" as="fetch" crossOrigin="anonymous" />
<link rel="preconnect" href="https://ss7.vzw.com" />
<link rel="dns-prefetch" href="https://appconfig-i2iv-east-np.ebiz.verizon.com" />
```

## 📈 **Implementation Timeline**

### Phase 1 (Week 1): Quick Wins
- [ ] Replace `<img>` with Next.js `<Image>`
- [ ] Add lazy loading to heavy components
- [ ] Optimize VDS imports
- [ ] Remove React Query devtools from production

### Phase 2 (Week 2): Bundle Optimization
- [ ] Implement code splitting for large routes
- [ ] Optimize middleware bundle
- [ ] Add service worker for caching
- [ ] Enhance static generation

### Phase 3 (Week 3): Advanced Performance
- [ ] React Query optimization
- [ ] Component memoization
- [ ] Resource preloading
- [ ] Performance monitoring setup

## 🎯 **Success Metrics**

### Target Performance Goals:
- **First Contentful Paint**: < 1.5s (current: ~3s)
- **Largest Contentful Paint**: < 2.5s
- **Bundle Size Reduction**: 30-40%
- **Lighthouse Score**: > 90

### Monitoring Setup:
```javascript
// lighthouse/.lighthouserc.js updates
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      settings: {
        preset: 'perf',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
      },
    },
  },
};
```

## 🔬 **Measurement & Testing**

### Performance Testing Strategy:
1. **Before/After Bundle Analysis**
2. **Lighthouse CI Integration**
3. **Real User Monitoring (RUM)**
4. **Core Web Vitals Tracking**

### Tools Already Available:
- ✅ Webpack Bundle Analyzer (`ANALYZE=true npm run build`)
- ✅ Lighthouse CI configuration
- ✅ Performance budgets defined
- ✅ Next.js built-in performance metrics

## 🚨 **Immediate Action Items**

1. **Fix Dynamic Server Usage**: Device protection route needs `force-dynamic`
2. **Image Optimization**: Replace all `<img>` tags immediately
3. **Bundle Splitting**: Implement lazy loading for `/smartphones/[slug]`
4. **Feature Flag Optimization**: Reduce redundant API calls

**Estimated Impact**: 40-50% improvement in initial page load times and 30% reduction in bundle size.Performance