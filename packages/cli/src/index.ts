import * as readline from 'readline';
import { scaffoldProject, TemplateType, getAvailableTemplates } from './generator';
export * from './generator';
export * from './plugin';

export async function runCLI(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  let projectName = args.find(arg => !arg.startsWith('-'));
  let templateArg: string | undefined;

  const templateFlagIdx = args.findIndex(a => a === '--template' || a === '-t');
  if (templateFlagIdx !== -1 && args[templateFlagIdx + 1]) {
    templateArg = args[templateFlagIdx + 1];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve));
  };

  try {
    if (!projectName) {
      projectName = await question('Project name (default: my-flux-app): ');
      projectName = projectName.trim() || 'my-flux-app';
    }

    if (!templateArg || !getAvailableTemplates().includes(templateArg as TemplateType)) {
      console.log('\nSelect a framework template:');
      console.log('  1) react    - React 18/19 + @flux/react');
      console.log('  2) vue      - Vue 3 + @flux/vue');
      console.log('  3) svelte   - Svelte + @flux/svelte');
      console.log('  4) solid    - SolidJS + @flux/solid');
      console.log('  5) vanilla  - Vanilla TypeScript + @flux/core');

      const choice = await question('Choice (1-5, default: 1): ');
      const trimmed = choice.trim();

      if (trimmed === '2' || trimmed === 'vue') templateArg = 'vue';
      else if (trimmed === '3' || trimmed === 'svelte') templateArg = 'svelte';
      else if (trimmed === '4' || trimmed === 'solid') templateArg = 'solid';
      else if (trimmed === '5' || trimmed === 'vanilla') templateArg = 'vanilla';
      else templateArg = 'react';
    }

    rl.close();

    console.log(`\n✨ Scaffolding ${projectName} with ${templateArg} template...`);
    const result = scaffoldProject({
      projectName,
      template: templateArg as TemplateType,
    });

    console.log(`\n🎉 Success! Created ${projectName} at ${result.projectPath}`);
    console.log('\nNext steps:');
    console.log(`  cd ${projectName}`);
    console.log('  npm install');
    console.log('  npm run dev\n');
  } catch (err: any) {
    rl.close();
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
create-flux-app - Scaffolding CLI for Flux Agentic AI Applications

Usage:
  npm create flux@latest [project-name] [options]
  npx create-flux-app [project-name] [options]

Options:
  -t, --template <template>   Framework template: react, vue, svelte, solid, vanilla
  -h, --help                  Display this help message

Examples:
  npm create flux@latest my-react-app --template react
  npm create flux@latest my-agent-app --template vue
  npm create flux@latest my-solid-app --template solid
`);
}
