import type { NextPageContext } from 'next';

function ErrorPage({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ padding: 24 }}>
      <h1>{statusCode || 500} - Error</h1>
      <p>Something went wrong.</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? (err as any)?.statusCode ?? 404;
  return { statusCode } as any;
};

export default ErrorPage;

