import { glob } from 'glob';
import * as path from 'path';
import { ghostDepCheckInt } from '../src/index.ts';
// import { ghostDepCheckInt } from '../lib/index.js';

const config = {
  excludeAlias: ['js', '@', '@components'],
};

function test() {
  const directory = path.resolve('./');
  const pattern = `${directory}/src/**/*.+(vue|js|ts)`;

  glob(pattern, {
    ignore: [
      path.join(directory, '**/node_modules/**'),
      path.join(directory, '**/test/**'),
      path.join(directory, '**/lib/**'),
      path.join(directory, '**/*.d.ts'),
    ],
  })
    .then(async files => {
      const pkgs = await ghostDepCheckInt(files, {
        dir: directory,
        ...config
      });

      if (pkgs.length) {
        console.log('The following deps maybe ghost deps: ', pkgs);
      } else {
        console.log('This project has no ghost dependencies.');
      }
    })
    .catch(err => {
      console.error('Error matching files:', err);
    });
}

test();
