#!/bin/bash

set -e

BASEDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for dir in $BASEDIR/*/; do # list directories in the form "/tmp/dirname/"
  dir=${dir%*/}                           # remove the trailing "/"
  echo "### Build ${dir##*/}"             # print everything after the final "/"
  cd $dir
  yarn install && yarn upgrade @sentio/sdk && yarn sentio build
done