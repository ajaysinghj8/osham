import { PropsWithChildren } from 'react';

export function Page(props: PropsWithChildren<{ title?: string; subtitle?: string }>) {
  return (
    <section className="page">
      {props.subtitle && <p className="page__subtitle">{props.subtitle}</p>}
      {props.children}
    </section>
  );
}
