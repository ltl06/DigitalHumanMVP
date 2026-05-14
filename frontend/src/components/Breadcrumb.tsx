import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const ROUTE_META: Record<string, { label: string; parent?: string }> = {
  '/': { label: '首页' },
  '/create': { label: '创建作品' },
  '/history': { label: '历史记录' },
  '/settings': { label: '系统设置' },
  '/cms': { label: '内容管理' },
  '/cms/exhibits': { label: '展品管理', parent: '/cms' },
  '/cms/contents': { label: '内容列表', parent: '/cms' },
  '/analytics': { label: '数据分析' },
};

export default function Breadcrumb() {
  const location = useLocation();
  const path = location.pathname;

  // Build crumbs from path
  const parts = path.split('/').filter(Boolean);
  const crumbs: { label: string; to: string }[] = [];

  // Try exact match first
  if (ROUTE_META[path]) {
    if (ROUTE_META[path].parent) {
      crumbs.push({ label: ROUTE_META[ROUTE_META[path].parent].label, to: ROUTE_META[path].parent });
    }
    crumbs.push({ label: ROUTE_META[path].label, to: path });
  } else {
    // Build from parts
    let accumulated = '';
    for (let i = 0; i < parts.length; i++) {
      accumulated += '/' + parts[i];
      const label = ROUTE_META[accumulated]?.label || parts[i];
      crumbs.push({ label, to: accumulated });
    }
  }

  if (crumbs.length <= 1) return null;

  return (
    <nav className="breadcrumb" aria-label="breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.to} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && (
            <ChevronRight size={12} className="breadcrumb-sep" />
          )}
          {i === crumbs.length - 1 ? (
            <span className="breadcrumb-current">{crumb.label}</span>
          ) : (
            <Link to={crumb.to}>{crumb.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
