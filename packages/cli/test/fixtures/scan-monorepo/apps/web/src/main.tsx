import React from 'react';
import { client } from '@acme/api';

export const App = () => <div>{String(client)}</div>;
