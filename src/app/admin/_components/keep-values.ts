"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React resets a <form action={…}> after every submission, which would wipe what an editor typed
 * when the server reports a validation error. Submitting through onSubmit keeps the fields as
 * they are; the action and its pending state are unchanged.
 */
export function keepValues(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}
