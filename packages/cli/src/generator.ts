import * as fs from 'fs';
import * as path from 'path';

export type TemplateType = 'vue' | 'svelte' | 'solid' | 'vanilla';

export interface ScaffoldOptions {
  projectName: string;
  template: TemplateType;
  targetDir?: string;
  dryRun?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  template: TemplateType;
  filesCreated: string[];
}

export function getAvailableTemplates(): TemplateType[] {
  return ['vue', 'svelte', 'solid', 'vanilla'];
}

export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  const { projectName, template, dryRun = false } = options;

  if (!getAvailableTemplates().includes(template)) {
    throw new Error(`Invalid template "${template}". Available templates: ${getAvailableTemplates().join(', ')}`);
  }

  const targetDir = options.targetDir || path.resolve(process.cwd(), projectName);
  const templateDir = path.resolve(__dirname, '../templates', template);

  const filesCreated: string[] = [];

  if (!fs.existsSync(templateDir)) {
    // If running in development or source mode, check relative source path
    const fallbackTemplateDir = path.resolve(__dirname, '../templates', template);
    if (!fs.existsSync(fallbackTemplateDir)) {
      throw new Error(`Template directory not found for "${template}" at ${templateDir}`);
    }
  }

  if (!dryRun) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  function copyRecursive(src: string, dest: string) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!dryRun && !fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        copyRecursive(srcPath, destPath);
      } else {
        filesCreated.push(destPath);
        if (!dryRun) {
          let content = fs.readFileSync(srcPath, 'utf8');

          // Dynamically replace project name in package.json and HTML
          if (entry.name === 'package.json') {
            try {
              const pkg = JSON.parse(content);
              pkg.name = projectName;
              content = JSON.stringify(pkg, null, 2);
            } catch {
              content = content.replace(/__PROJECT_NAME__/g, projectName);
            }
          } else {
            content = content.replace(/__PROJECT_NAME__/g, projectName);
          }

          fs.writeFileSync(destPath, content, 'utf8');
        }
      }
    }
  }

  copyRecursive(templateDir, targetDir);

  // Generate .gitignore if missing
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (!filesCreated.includes(gitignorePath)) {
    filesCreated.push(gitignorePath);
    if (!dryRun) {
      fs.writeFileSync(
        gitignorePath,
        `node_modules\ndist\n.DS_Store\n*.local\n`,
        'utf8'
      );
    }
  }

  return {
    success: true,
    projectPath: targetDir,
    template,
    filesCreated,
  };
}
