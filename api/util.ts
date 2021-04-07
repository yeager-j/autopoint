export function unimplemented(error?: string): never {
    console.trace(error || 'Unimplemented!');
    process.exit(1);
}