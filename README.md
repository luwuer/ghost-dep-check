### Install
```bash
pnpm i ghost-dep-check
```

### Usage
```ts
import { ghostDepCheck } from 'ghost-dep-check';

const config = {
  excludeAlias: ['js', '@', '@components'],
};

function check() {
  const directory = path.resolve('./');
  const pattern = `${directory}/src/**/*.+(vue|js|ts)`;
  glob(pattern, {
    ignore: [
      path.join(directory, '**/node_modules/**'),
    ],
  })
    .then(async files => {
      const pkgs = await ghostDepCheck(files, [path.join(directory, 'package.json')], config);

      if (pkgs.size) {
        console.log('The following deps maybe ghost deps: ', pkgs);
      } else {
        console.log('This project has no ghost dependencies.');
      }
    })
    .catch(err => {
      console.error('Error matching files:', err);
    });
}

check();
```

### Preview
```bash
# in process
⠼  Checking files: 174/200 | 87% [============================================>      ]
# success
✔  Checking files: 200/200 | 100% [==================================================]
This project has no ghost dependencies.
```
