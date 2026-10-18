import { useSearchParams } from 'react-router-dom';
import { t } from '../../i18n/i18n';
import { PageHeader } from '../../app/shell/PageHeader';
import { SearchBox } from './SearchBox';

/** Full-page search, used from the mobile top bar. */
export function SearchPage() {
  const [params] = useSearchParams();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('search.title')} />
      <SearchBox autoFocus initialQuery={params.get('q')?.slice(0, 200) ?? ''} />
    </div>
  );
}
