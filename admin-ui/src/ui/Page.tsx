import React, { PropsWithChildren } from 'react';

export function Page(props: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <section className="page">
      <h1>{props.title}</h1>
      <p>{props.subtitle}</p>
      {props.children}
    </section>
  );
}
