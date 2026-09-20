const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
  try {
    const all = await cloudinary.search.expression('resource_type:video').max_results(1).execute();
    console.log('Total videos in Cloudinary:', all.total_count);

    const fAll = await cloudinary.search.expression('resource_type:video AND asset_folder:"All Songs"').max_results(1).execute();
    console.log('asset_folder "All Songs":', fAll.total_count);

    const fHills = await cloudinary.search.expression('resource_type:video AND asset_folder:"Hills"').max_results(1).execute();
    console.log('asset_folder "Hills":', fHills.total_count);

    const fSharu = await cloudinary.search.expression('resource_type:video AND asset_folder:"Sharu"').max_results(1).execute();
    console.log('asset_folder "Sharu":', fSharu.total_count);

    const fFolderAll = await cloudinary.search.expression('resource_type:video AND folder:"All Songs"').max_results(1).execute();
    console.log('folder "All Songs":', fFolderAll.total_count);

    const fFolderHills = await cloudinary.search.expression('resource_type:video AND folder:"Hills"').max_results(1).execute();
    console.log('folder "Hills":', fFolderHills.total_count);

    const fFolderSharu = await cloudinary.search.expression('resource_type:video AND folder:"Sharu"').max_results(1).execute();
    console.log('folder "Sharu":', fFolderSharu.total_count);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
