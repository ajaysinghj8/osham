import React, { PropsWithChildren } from 'react';

export function Card(props: PropsWithChildren<{ title: string }>) {
  return (
    <div className="card">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}
