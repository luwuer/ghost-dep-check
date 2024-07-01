import { glob } from 'glob';
import * as path from 'path';
import { ghostDepCheck } from '../src/index.ts';

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

test();
